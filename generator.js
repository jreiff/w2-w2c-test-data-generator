import { faker } from '@faker-js/faker';

// US States
const US_STATES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'FL', 'GA',
  'HI', 'ID', 'IL', 'IN', 'IA', 'KS', 'KY', 'LA', 'ME', 'MD',
  'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH', 'NJ',
  'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC',
  'SD', 'TN', 'TX', 'UT', 'VT', 'VA', 'WA', 'WV', 'WI', 'WY'
];

// States with local taxes
const STATES_WITH_LOCALITIES = ['PA', 'OH', 'KY', 'IN', 'MI', 'MD', 'NY', 'AL'];

// Locality codes
const LOCALITY_CODES = ['09 WRNGT', '46 WHTPN', '01 PHILA', '02 PITTS', '03 ALLEN', '15 YORK'];

// Box 12 codes
const BOX_12_CODES = [
  { code: 'D', description: 'Deferred compensation' },
  { code: 'W', description: 'Employer contributions to HSA' },
  { code: 'DD', description: 'Cost of employer-sponsored health coverage' },
  { code: 'E', description: 'Employer contributions to 401(k)' },
  { code: 'G', description: 'Employer contributions to 403(b)' },
  { code: 'H', description: 'Employer contributions to 457(b)' }
];

// Helper functions
function roundCurrencyToString(value) {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toFixed(2);
}

function intToString(value) {
  return String(value);
}

function formatAddress(lines) {
  return lines.join('&#xa;') + '&#xa;';
}

function generateSSN() {
  const part1 = faker.string.numeric(3);
  const part2 = faker.string.numeric(2);
  const part3 = faker.string.numeric(4);
  return `${part1}-${part2}-${part3}`;
}

function generateEmployeeID() {
  return faker.string.alphanumeric({ length: 7, casing: 'lower' });
}

function generateEIN() {
  const part1 = faker.string.numeric(2);
  const part2 = faker.string.numeric(7);
  return `${part1}-${part2}`;
}

function generateStateID() {
  return faker.string.numeric(9);
}

// Get state name from code
function getStateName(stateCode) {
  const stateNames = {
    'AL': 'Alabama', 'AK': 'Alaska', 'AZ': 'Arizona', 'AR': 'Arkansas', 'CA': 'California',
    'CO': 'Colorado', 'CT': 'Connecticut', 'DE': 'Delaware', 'FL': 'Florida', 'GA': 'Georgia',
    'HI': 'Hawaii', 'ID': 'Idaho', 'IL': 'Illinois', 'IN': 'Indiana', 'IA': 'Iowa',
    'KS': 'Kansas', 'KY': 'Kentucky', 'LA': 'Louisiana', 'ME': 'Maine', 'MD': 'Maryland',
    'MA': 'Massachusetts', 'MI': 'Michigan', 'MN': 'Minnesota', 'MS': 'Mississippi', 'MO': 'Missouri',
    'MT': 'Montana', 'NE': 'Nebraska', 'NV': 'Nevada', 'NH': 'New Hampshire', 'NJ': 'New Jersey',
    'NM': 'New Mexico', 'NY': 'New York', 'NC': 'North Carolina', 'ND': 'North Dakota', 'OH': 'Ohio',
    'OK': 'Oklahoma', 'OR': 'Oregon', 'PA': 'Pennsylvania', 'RI': 'Rhode Island', 'SC': 'South Carolina',
    'SD': 'South Dakota', 'TN': 'Tennessee', 'TX': 'Texas', 'UT': 'Utah', 'VT': 'Vermont',
    'VA': 'Virginia', 'WA': 'Washington', 'WV': 'West Virginia', 'WI': 'Wisconsin', 'WY': 'Wyoming'
  };
  return stateNames[stateCode] || stateCode;
}

// Generate companies
function generateCompanies() {
  const parentCompany = faker.company.name();
  const companies = [];
  
  for (let i = 0; i < 6; i++) {
    const company = {
      name: `${parentCompany} ${faker.company.buzzNoun()}`,
      ein: generateEIN(),
      address: {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.helpers.arrayElement(US_STATES),
        zip: faker.location.zipCode()
      },
      states: []
    };
    
    // 1-2 states per company
    const numStates = faker.number.int({ min: 1, max: 2 });
    const selectedStates = faker.helpers.arrayElements(US_STATES, numStates);
    
    for (const state of selectedStates) {
      const stateData = {
        code: state,
        stateID: generateStateID(),
        localities: []
      };
      
      // 0-3 localities per state (only if state has localities)
      if (STATES_WITH_LOCALITIES.includes(state)) {
        const numLocalities = faker.number.int({ min: 0, max: 3 });
        if (numLocalities > 0) {
          stateData.localities = faker.helpers.arrayElements(LOCALITY_CODES, numLocalities);
        }
      }
      
      company.states.push(stateData);
    }
    
    companies.push(company);
  }
  
  return companies;
}

// Generate W2 for an employee
function generateW2(employee, company, stateData, calendarYear) {
  const baseWages = faker.number.float({ min: 30000, max: 200000, fractionDigits: 2 });
  const stateWages = baseWages * faker.number.float({ min: 0.8, max: 1.2, fractionDigits: 2 });
  const localWages1 = stateWages * faker.number.float({ min: 0.7, max: 1.0, fractionDigits: 2 });
  const localWages2 = stateWages * faker.number.float({ min: 0.1, max: 0.3, fractionDigits: 2 });
  
  const ssWages = Math.min(baseWages, 160200); // Social Security wage base limit
  const medicareWages = baseWages;
  
  const federalTax = baseWages * faker.number.float({ min: 0.12, max: 0.22, fractionDigits: 2 });
  const stateTax = stateWages * faker.number.float({ min: 0.02, max: 0.06, fractionDigits: 2 });
  const ssTax = ssWages * 0.062;
  const medicareTax = medicareWages * 0.0145;
  const localTax1 = localWages1 * faker.number.float({ min: 0.008, max: 0.015, fractionDigits: 2 });
  const localTax2 = localWages2 * faker.number.float({ min: 0.008, max: 0.015, fractionDigits: 2 });
  
  const locality1 = stateData.localities[0] || '';
  const locality2 = stateData.localities[1] || '';
  
  const box12Codes = faker.helpers.arrayElements(BOX_12_CODES, faker.number.int({ min: 0, max: 3 }));
  
  // Generate Box 12 values first (needed for State ID Number field)
  const box12Values = {};
  if (box12Codes.length > 0) {
    box12Values.a = roundCurrencyToString(faker.number.float({ min: 1000, max: 10000, fractionDigits: 2 }));
  }
  if (box12Codes.length > 1) {
    box12Values.b = roundCurrencyToString(faker.number.float({ min: 1000, max: 10000, fractionDigits: 2 }));
  }
  if (box12Codes.length > 2) {
    box12Values.c = roundCurrencyToString(faker.number.float({ min: 1000, max: 30000, fractionDigits: 2 }));
  }
  
  // Generate State ID Number field in the correct format
  // Format: "W-2 for [First Name] [Last Name] ([Employee_ID]) for [Company] for the [Year] [State Name] has 12 Box 12 [Code] (W-2) Value = [Value]"
  let stateIDNumber = `W-2 for ${employee.firstName} ${employee.lastName} (${employee.id}) for ${company.name} for the ${calendarYear} ${getStateName(stateData.code)}`;
  if (box12Codes.length > 0 && box12Values.a) {
    stateIDNumber += ` has 12 Box 12 ${box12Codes[0].code} (W-2) Value = ${box12Values.a}`;
  }
  
  const w2 = {
    "Availability_Date": `${parseInt(calendarYear) + 1}-01-17`,
    "Box_14_group": roundCurrencyToString(faker.number.float({ min: 0, max: 1000, fractionDigits: 2 })),
    "Calendar_Year": `${calendarYear}-01-01`,
    "Company": company.name,
    "Employee_ID": employee.id,
    "First_Name": employee.firstName,
    "Last_Name": employee.lastName,
    "Payroll_Tax_State_Code": stateData.code,
    "Social_Security_Number-Truncated": `${employee.firstName} ${employee.lastName}`,
    "Social_Security_Number-Truncated_51698499": employee.ssn,
    "Worker": `${employee.firstName} ${employee.lastName} (${employee.id})`,
    "XMLNAME_10_-_Dependent_care_benefits_group": roundCurrencyToString(faker.number.float({ min: 0, max: 5000, fractionDigits: 2 })),
    "XMLNAME_13_-__Retirement_plan_Box_group": intToString(faker.number.int({ min: 0, max: 1 })),
    "XMLNAME_15_-_Payroll_Tax_State_Code": stateData.code,
    "XMLNAME_15_-_State_-_Employer_s_State_ID_Number": stateIDNumber,
    "XMLNAME_15_-_State_-_Employer_s_state_ID_number__Previous_": stateData.stateID,
    "XMLNAME_16_-_State_Wages_tips__etc_group": roundCurrencyToString(stateWages),
    "XMLNAME_17_-_State_income_tax_group": roundCurrencyToString(stateTax),
    "XMLNAME_1_-_Wages__tips__and_other_compensation_group": roundCurrencyToString(baseWages),
    "XMLNAME_2_-_Federal_income_tax_withheld_group": roundCurrencyToString(federalTax),
    "XMLNAME_3_-_Social_security_wages_group": roundCurrencyToString(ssWages),
    "XMLNAME_4_-_Social_security_tax_withheld_group": roundCurrencyToString(ssTax),
    "XMLNAME_5_-_Medicare_wages_and_tips_group": roundCurrencyToString(medicareWages),
    "XMLNAME_6_-_Medicare_tax_withheld_group": roundCurrencyToString(medicareTax),
    "b_-_Employer_identification_number__EIN_": company.ein,
    "c_-_Employer_s_name__address__and_ZIP_code": formatAddress([
      company.name,
      company.address.street,
      `${company.address.city}, ${company.address.state} ${company.address.zip}`
    ]),
    "f_-_Employee_s_address": formatAddress([
      employee.address.street,
      `${employee.address.city}, ${employee.address.state} ${employee.address.zip}`
    ])
  };
  
  // Add Box 12 fields (always include XMLNAME_12d, even if 0)
  if (box12Codes.length > 0) {
    w2[`XMLNAME_12a`] = box12Values.a;
    w2[`XMLNAME_12a_Code`] = box12Codes[0].code;
  }
  if (box12Codes.length > 1) {
    w2[`XMLNAME_12b`] = box12Values.b;
    w2[`XMLNAME_12b_Code`] = box12Codes[1].code;
  }
  if (box12Codes.length > 2) {
    w2[`XMLNAME_12c`] = box12Values.c;
    w2[`XMLNAME_12c_Code`] = box12Codes[2].code;
  }
  // Always include XMLNAME_12d
  if (box12Codes.length > 3) {
    w2[`XMLNAME_12d`] = roundCurrencyToString(faker.number.float({ min: 0, max: 5000, fractionDigits: 2 }));
  } else {
    w2[`XMLNAME_12d`] = "0";
  }
  
  // Add local wages and taxes (only if localities exist)
  if (locality1) {
    w2["XMLNAME_18_-_Local_wages__tips__etc_1"] = roundCurrencyToString(localWages1);
    w2["XMLNAME_19_-_Local_income_tax_1"] = roundCurrencyToString(localTax1);
    w2["XMLNAME_20_-_Locality_name_1"] = locality1;
  }
  if (locality2) {
    w2["XMLNAME_18_-_Local_wages__tips__etc_2"] = roundCurrencyToString(localWages2);
    w2["XMLNAME_19_-_Local_income_tax_2"] = roundCurrencyToString(localTax2);
    w2["XMLNAME_20_-_Locality_name_2"] = locality2;
  }
  
  return w2;
}

// Generate W2C for a W2
function generateW2C(w2, calendarYear) {
  const shouldChangeSSN = faker.datatype.boolean({ probability: 0.1 });
  const shouldChangeStateID = faker.datatype.boolean({ probability: 0.2 });
  const shouldChangeStateWages = faker.datatype.boolean({ probability: 0.8 });
  const shouldChangeLocalWages = faker.datatype.boolean({ probability: 0.5 });
  
  const originalStateWages = parseFloat(w2["XMLNAME_16_-_State_Wages_tips__etc_group"]);
  const correctedStateWages = shouldChangeStateWages 
    ? originalStateWages * faker.number.float({ min: 0.9, max: 1.1, fractionDigits: 2 })
    : originalStateWages;
  
  // Get the numeric state ID from the Previous field (not the descriptive string)
  const stateIDNumber = w2["XMLNAME_15_-_State_-_Employer_s_state_ID_number__Previous_"] || 
                        w2["XMLNAME_15_-_State_-_Employer_s_State_ID_Number"]?.match(/\d+$/)?.[0] || 
                        generateStateID();
  
  const w2c = {
    "Availability_Date": `${parseInt(calendarYear) + 1}-04-15`,
    "Calendar_Year": `${calendarYear}-01-01`,
    "Company": w2.Company,
    "Created_Moment": `${parseInt(calendarYear) + 1}-04-10T${String(faker.number.int({ min: 10, max: 15 })).padStart(2, '0')}:${faker.string.numeric(2)}:${faker.string.numeric(2)}.${faker.string.numeric(3)}-07:00`,
    "Employee_ID": w2.Employee_ID,
    "First_Name_W2C": w2.First_Name,
    "Last_Name_W2C": w2.Last_Name,
    "Name_or_SSN_Changed": shouldChangeSSN ? "1" : "0",
    "Social_Security_Number-Truncated": w2["Social_Security_Number-Truncated"],
    "Social_Security_Number-Truncated_51698499_W2C": shouldChangeSSN 
      ? generateSSN() 
      : w2["Social_Security_Number-Truncated_51698499"],
    "Worker_from_Primary_W-2": w2.Worker,
    "XMLNAME_15_-_Payroll_Tax_State_Code": w2["XMLNAME_15_-_Payroll_Tax_State_Code"],
    "XMLNAME_15_-_State_-_Employer_s_State_ID_Number": stateIDNumber,
    "XMLNAME_15_-_State_-_Employer_s_State_ID_Number_W2C": shouldChangeStateID 
      ? generateStateID() 
      : stateIDNumber,
    "XMLNAME_16_-_State_Wages_tips__etc_group": roundCurrencyToString(originalStateWages),
    "XMLNAME_16_-_State_Wages_tips__etc_group_W2C": roundCurrencyToString(correctedStateWages),
    "b_-_Employer_identification_number__EIN_": w2["b_-_Employer_identification_number__EIN_"],
    "c_-_Employer_s_name__address__and_ZIP_code": w2["c_-_Employer_s_name__address__and_ZIP_code"],
    "f_-_Employee_s_address": w2["f_-_Employee_s_address"]
  };
  
  // Add local wages corrections if they exist in W2
  // Both W2 and W2C use "etc_1" and "etc_2" (without period) for local wages
  if (w2["XMLNAME_18_-_Local_wages__tips__etc_1"]) {
    const originalLocal1 = parseFloat(w2["XMLNAME_18_-_Local_wages__tips__etc_1"]);
    const correctedLocal1 = shouldChangeLocalWages 
      ? originalLocal1 * faker.number.float({ min: 0.9, max: 1.1, fractionDigits: 2 })
      : originalLocal1;
    w2c["XMLNAME_18_-_Local_wages__tips__etc_1"] = roundCurrencyToString(originalLocal1);
    w2c["XMLNAME_18_-_Local_wages__tips__etc_1_W2C"] = roundCurrencyToString(correctedLocal1);
    // Include locality name for matching
    if (w2["XMLNAME_20_-_Locality_name_1"]) {
      w2c["XMLNAME_20_-_Locality_name_1"] = w2["XMLNAME_20_-_Locality_name_1"];
    }
  }
  if (w2["XMLNAME_18_-_Local_wages__tips__etc_2"]) {
    const originalLocal2 = parseFloat(w2["XMLNAME_18_-_Local_wages__tips__etc_2"]);
    const correctedLocal2 = shouldChangeLocalWages 
      ? originalLocal2 * faker.number.float({ min: 0.9, max: 1.1, fractionDigits: 2 })
      : originalLocal2;
    w2c["XMLNAME_18_-_Local_wages__tips__etc_2"] = roundCurrencyToString(originalLocal2);
    w2c["XMLNAME_18_-_Local_wages__tips__etc_2_W2C"] = roundCurrencyToString(correctedLocal2);
    // Include locality name for matching
    if (w2["XMLNAME_20_-_Locality_name_2"]) {
      w2c["XMLNAME_20_-_Locality_name_2"] = w2["XMLNAME_20_-_Locality_name_2"];
    }
  }
  
  return w2c;
}

// Generate employee data
export function generateEmployeeData(numEmployees, calendarYear) {
  const companies = generateCompanies();
  const employees = [];
  
  // Generate employees
  for (let i = 0; i < numEmployees; i++) {
    const employee = {
      id: generateEmployeeID(),
      firstName: faker.person.firstName(),
      lastName: faker.person.lastName(),
      ssn: generateSSN(),
      address: {
        street: faker.location.streetAddress(),
        city: faker.location.city(),
        state: faker.helpers.arrayElement(US_STATES),
        zip: faker.location.zipCode()
      },
      w2s: { Report_Entry: [] },
      w2cs: { Report_Entry: [] }
    };
    
    // 10% of employees work for more than one company
    const numCompanies = faker.datatype.boolean({ probability: 0.1 }) 
      ? faker.number.int({ min: 2, max: 3 })
      : 1;
    const employeeCompanies = faker.helpers.arrayElements(companies, numCompanies);
    
    // Generate W2s for each company/state combination
    for (const company of employeeCompanies) {
      for (const stateData of company.states) {
        const w2 = generateW2(employee, company, stateData, calendarYear);
        employee.w2s.Report_Entry.push(w2);
        
        // 30% chance of having W2Cs (0-2 per W2)
        if (faker.datatype.boolean({ probability: 0.3 })) {
          const numW2Cs = faker.number.int({ min: 1, max: 2 });
          for (let j = 0; j < numW2Cs; j++) {
            const w2c = generateW2C(w2, calendarYear);
            employee.w2cs.Report_Entry.push(w2c);
          }
        }
      }
    }
    
    employees.push(employee);
  }
  
  return { employees, companies };
}

